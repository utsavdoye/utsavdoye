// profile.json -> assets/hero.svg (desktop) + assets/hero-mobile.svg (phones)
// The animated terminal at the top of the README. Edit profile.json, not the SVGs.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { COLOR, createTerminal } from "./term.mjs"

const root = new URL("../../", import.meta.url)
const me = JSON.parse(readFileSync(new URL("profile.json", root), "utf8"))

// Greedy word wrap to `width` columns.
function wrap(text, width) {
  const lines = []
  let line = ""
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  return [...lines, line]
}

function build({ narrow, ...size }) {
  const term = createTerminal({ ...size, user: me.handle })
  const { put, typed, idle, appearAt, cols } = term
  let row = 0
  let t = 0.3 // running clock, in seconds

  // Print lines one after another, each fading in slightly after the last.
  const print = (lines, { col = 0, at, ...style } = {}) =>
    lines.forEach((line, i) => put(row++, col, line, { ...style, cls: appearAt(at + i * 0.08) }))

  // $ whoami  (set "intro" in profile.json to change the first command)
  t = typed(row++, me.intro, { promptAt: t, typeAt: t + 0.3 }) + 0.25
  const oneLine = `${me.name} | ${me.tagline}`
  if (!narrow && oneLine.length <= cols) {
    const cls = appearAt(t)
    const col = put(row, 0, me.name, { fill: "#FFFFFF", bold: true, cls })
    put(row++, col, ` | ${me.tagline}`, { fill: COLOR.dim, cls })
  } else {
    print([me.name], { at: t, fill: "#FFFFFF", bold: true })
    print(me.tagline.split(" | ").flatMap(part => wrap(part, cols)), { at: t, fill: COLOR.dim })
  }
  print(wrap(me.about, cols), { at: t + 0.1 })
  row++

  // $ cat -n focus.txt
  t = typed(row++, "cat -n focus.txt", { promptAt: t + 0.55, typeAt: t + 0.85 }) + 0.25
  const gutter = narrow ? 3 : 6
  me.focus.forEach((item, i) => {
    put(row, 0, String(i + 1).padStart(gutter), { fill: COLOR.dim, cls: appearAt(t + i * 0.1) })
    print(wrap(item, cols - gutter - 2), { col: gutter + 2, at: t + i * 0.1 })
  })
  row++

  // $ ./internship --status
  t = typed(row++, me.status.command, { promptAt: t + 0.55, typeAt: t + 0.85 }) + 0.3
  const badge = `[${me.status.label}]`
  if (!narrow && badge.length + 2 + me.status.text.length <= cols) {
    const cls = appearAt(t)
    put(row, 0, badge, { fill: COLOR.green, bold: true, cls })
    put(row++, badge.length + 2, me.status.text, { cls })
  } else {
    print([badge], { at: t, fill: COLOR.green, bold: true })
    print(me.status.text.split(" | ").flatMap(part => wrap(part, cols)), { at: t + 0.08 })
  }
  row++

  idle(row++, t + 0.6)

  const label = `${me.name}. ${me.tagline}. ${me.about} Focus: ${me.focus.join("; ")}. ${me.status.label}: ${me.status.text}.`
  return term.render({ rows: row, title: narrow ? "" : `${me.handle}@github: ~`, label })
}

mkdirSync(new URL("assets/", root), { recursive: true })
writeFileSync(new URL("assets/hero.svg", root), build({ width: 800, fontSize: 15, lineHeight: 23, padding: 20, narrow: false }))
writeFileSync(new URL("assets/hero-mobile.svg", root), build({ width: 420, fontSize: 14, lineHeight: 21, padding: 14, narrow: true }))
console.log("assets/hero.svg and assets/hero-mobile.svg written")
