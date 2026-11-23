import { upscale } from './base32.mjs';
import { draw as d32 } from './design32_r7.mjs';
export function draw(g) { upscale(g, d32); }
