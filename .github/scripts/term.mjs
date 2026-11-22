// Shared helpers: draw an Ubuntu-style terminal window as a self-contained SVG.
// Colours and font match the lowlighter/metrics "terminal" template, so the
// hand-made panels and the generated one look like the same terminal app.

import { readFileSync } from "node:fs"

const FONT_CSS = readFileSync(new URL("./courier-prime.css", import.meta.url), "utf8")

export const COLOR = {
  bg: "#42092B",
  text: "#DDDDDD",
  dim: "#AE9DA7",
  green: "#7EDA29",
  blue: "#4878C0",
}

const GLYPH_WIDTH = 0.6 // every Courier Prime glyph is 0.6em wide

export const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

// The embedded font only covers ASCII. Anything else falls back to another
// font with a different width and breaks the column grid, so fail loudly.
export function assertAscii(value, where) {
  const bad = String(value).match(/[^\x20-\x7E]|\\/)
  if (bad) throw new Error(`${where}: use plain ASCII only (found "${bad[0]}" in "${value}")`)
}

export function createTerminal({ width, fontSize, lineHeight, padding, user, host = "github" }) {
  const ch = fontSize * GLYPH_WIDTH
  const bar = Math.round(lineHeight * 1.2)
  const cols = Math.floor((width - 2 * padding) / ch)
  const parts = [] // SVG fragments, in paint order
  const rules = [] // per-element animation CSS
  let uid = 0

  const x = col => +(padding + col * ch).toFixed(2)
  const top = row => bar + padding + row * lineHeight
  const baseline = row => +(top(row) + lineHeight * 0.72).toFixed(2)

  // Text is placed on a column grid. Runs of 2+ spaces are skipped rather than
  // drawn, because SVG collapses repeated spaces.
  function put(row, col, str, { fill = COLOR.text, bold = false, cls = "" } = {}) {
    assertAscii(str, "terminal text")
    if (col + str.length > cols) throw new Error(`Line too long (${col + str.length} > ${cols} columns): "${str}"`)
    let out = ""
    for (const m of str.matchAll(/\S+(?: \S+)*/g)) {
      const len = +(m[0].length * ch).toFixed(2)
      out += `<text x="${x(col + m.index)}" y="${baseline(row)}" textLength="${len}" fill="${fill}"${bold ? ' font-weight="bold"' : ""}>${esc(m[0])}</text>`
    }
    parts.push(cls ? `<g class="${cls}">${out}</g>` : out)
    return col + str.length
  }

  // Fade a row (or group of rows) in at `at` seconds.
  function appearAt(at) {
    const cls = `o${++uid}`
    rules.push(`.${cls}{animation-delay:${at.toFixed(2)}s}`)
    return `o ${cls}`
  }

  // "user@host:~$ " prompt. Returns the column where the command starts.
  function prompt(row, { cls = "" } = {}) {
    let col = put(row, 0, `${user}@${host}`, { fill: COLOR.green, cls })
    col = put(row, col, ":", { cls })
    col = put(row, col, "~", { fill: COLOR.blue, cls })
    col = put(row, col, "$", { cls })
    return col + 1
  }

  // A prompt whose command gets typed out, one character per step.
  // A background-coloured cover sits on the command and slides right in steps;
  // the cursor rides on its left edge. With animations off, the cover rests to
  // the right of the command, so the full line is simply visible.
  function typed(row, command, { promptAt, typeAt, perChar = 0.055 }) {
    const start = prompt(row, { cls: appearAt(promptAt) })
    put(row, start, command, { fill: "#FFFFFF" })
    const w = +(command.length * ch).toFixed(2)
    const duration = command.length * perChar
    const id = ++uid
    rules.push(
      `.t${id}{transform:translateX(${w}px);animation:type ${duration.toFixed(2)}s steps(${command.length},end) ${typeAt.toFixed(2)}s both}`,
      `.c${id}{animation:cursor ${(typeAt - promptAt + duration + 0.2).toFixed(2)}s linear ${promptAt.toFixed(2)}s}`,
    )
    parts.push(
      `<g class="t${id}">` +
        `<rect x="${x(start) - 0.5}" y="${top(row)}" width="${w + 1}" height="${lineHeight}" fill="${COLOR.bg}"/>` +
        `<rect class="cur c${id}" x="${x(start)}" y="${top(row) + lineHeight * 0.14}" width="${ch.toFixed(2)}" height="${(lineHeight * 0.78).toFixed(2)}" fill="${COLOR.text}"/>` +
        `</g>`,
    )
    return typeAt + duration
  }

  // Final idle prompt with a blinking cursor.
  function idle(row, at) {
    const start = prompt(row, { cls: appearAt(at) })
    const id = ++uid
    rules.push(`.f${id}{animation:o 1ms linear ${at.toFixed(2)}s backwards,blink 1.1s steps(1,end) ${at.toFixed(2)}s infinite}`)
    parts.push(`<rect class="f${id}" x="${x(start)}" y="${top(row) + lineHeight * 0.14}" width="${ch.toFixed(2)}" height="${(lineHeight * 0.78).toFixed(2)}" fill="${COLOR.text}"/>`)
  }

  function raw(svg) {
    parts.push(svg)
  }

  function render({ rows, title = "", label }) {
    const height = Math.round(top(rows) + padding)
    const by = bar / 2
    const button = (cx, fill, glyph) => `<circle cx="${cx}" cy="${by}" r="${(bar * 0.3).toFixed(1)}" fill="url(#${fill})"/>${glyph(cx)}`
    const g = bar * 0.13
    const stroke = `stroke="#1c1b19" stroke-opacity=".75" stroke-width="1.1" fill="none"`
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<defs>
<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#504B45"/><stop offset="1" stop-color="#3C3B37"/></linearGradient>
<linearGradient id="btn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7D7871"/><stop offset="1" stop-color="#595953"/></linearGradient>
<linearGradient id="exit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F37458"/><stop offset="1" stop-color="#DE4C12"/></linearGradient>
<clipPath id="win"><rect width="${width}" height="${height}" rx="6"/></clipPath>
<style>
${FONT_CSS}
text{font-family:'Courier Prime',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:${fontSize}px}
.o{animation:o .3s ease-out both}
.cur{opacity:0}
.bar{transform-box:fill-box;transform-origin:50% 100%;animation:grow .7s cubic-bezier(.2,.8,.2,1) both}
.hbar{transform-box:fill-box;transform-origin:0 50%;animation:growx .7s cubic-bezier(.2,.8,.2,1) both}
@keyframes o{from{opacity:0}}
@keyframes type{from{transform:translateX(0)}}
@keyframes cursor{from,to{opacity:1}}
@keyframes blink{50%{opacity:0}}
@keyframes grow{from{transform:scaleY(0)}}
@keyframes growx{from{transform:scaleX(0)}}
${rules.join("\n")}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</defs>
<g clip-path="url(#win)">
<rect width="${width}" height="${height}" fill="${COLOR.bg}"/>
<rect width="${width}" height="${bar}" fill="url(#bar)"/>
${title ? `<text x="${width / 2}" y="${(by + fontSize * 0.32).toFixed(1)}" text-anchor="middle" fill="#D5D0CE" style="font-size:${(fontSize * 0.9).toFixed(1)}px">${esc(title)}</text>` : ""}
${button(width - bar * 2.05, "btn", c => `<path d="M${c - g} ${by}h${2 * g}" ${stroke}/>`)}
${button(width - bar * 1.3, "btn", c => `<rect x="${c - g}" y="${by - g}" width="${2 * g}" height="${2 * g}" ${stroke}/>`)}
${button(width - bar * 0.55, "exit", c => `<path d="M${c - g} ${by - g}l${2 * g} ${2 * g}M${c + g} ${by - g}l${-2 * g} ${2 * g}" ${stroke}/>`)}
${parts.join("\n")}
</g>
</svg>
`
  }

  return { ch, cols, x, top, baseline, put, prompt, typed, idle, appearAt, raw, rules, render }
}
