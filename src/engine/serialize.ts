import { clampSize, newId, type FramePose, type Project, type Rig } from "./project.ts";

/** Formato JSON salvo em disco / enviado pela rede. Pixels em base64. */
export interface ProjectJSON {
  format: "anima-o";
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  palette: Project["palette"];
  layers: Project["layers"];
  frames: { id: string; duration?: number; pose?: FramePose; cels: Record<string, string> }[];
  /** Esqueleto opcional (só se o projeto usa rig). */
  rig?: Rig;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function toJSON(p: Project): ProjectJSON {
  return {
    format: "anima-o",
    version: 1,
    name: p.name,
    width: p.width,
    height: p.height,
    fps: p.fps,
    palette: p.palette,
    layers: p.layers,
    ...(p.rig ? { rig: p.rig } : {}),
    frames: p.frames.map((f) => ({
      id: f.id,
      ...(f.duration !== undefined ? { duration: f.duration } : {}),
      ...(f.pose ? { pose: f.pose } : {}),
      cels: Object.fromEntries(Object.entries(f.cels).map(([k, v]) => [k, toBase64(v)])),
    })),
  };
}

export function fromJSON(j: ProjectJSON): Project {
  if (j?.format !== "anima-o") throw new Error("Arquivo não é um projeto anima-o.");
  const width = clampSize(j.width);
  const height = clampSize(j.height);
  const size = width * height;
  const layers = j.layers.length ? j.layers : [{ id: newId("L"), name: "Base", visible: true }];
  return {
    name: j.name,
    width,
    height,
    fps: j.fps,
    palette: j.palette,
    layers,
    rig: j.rig,
    frames: j.frames.map((f) => ({
      id: f.id,
      duration: f.duration,
      pose: f.pose,
      cels: Object.fromEntries(
        layers.map((l) => {
          const raw = f.cels[l.id] ? fromBase64(f.cels[l.id]) : new Uint8Array(size);
          const cel = new Uint8Array(size);
          cel.set(raw.subarray(0, size));
          // descarta índices fora da paleta
          for (let i = 0; i < size; i++) if (cel[i] > j.palette.length) cel[i] = 0;
          return [l.id, cel];
        }),
      ),
    })),
  };
}
