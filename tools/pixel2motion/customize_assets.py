from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "design" / "animations" / "pixel2motion_outputs"

BLUE = "#78a7ef"
ORANGE = "#ff7918"
CREAM = "#fff4e4"
INK = "#0b1017"


def embedded(source: Path) -> str:
    return base64.b64encode(source.read_bytes()).decode("ascii")


def human_svg() -> str:
    return f'''<g id="human" fill="{CREAM}" stroke="{CREAM}" stroke-linecap="round" stroke-linejoin="round">
  <circle id="human-head" cx="627" cy="735" r="34" stroke="none"/>
  <rect id="human-body" x="589" y="774" width="76" height="132" rx="26" stroke="none"/>
  <line id="human-left-leg" x1="614" y1="895" x2="600" y2="1012" stroke-width="38"/>
  <line id="human-right-leg" x1="642" y1="895" x2="656" y2="1012" stroke-width="38"/>
</g>
<g id="left-arm" fill="none" stroke="{CREAM}" stroke-linecap="round">
  <line x1="606" y1="805" x2="470" y2="790" stroke-width="27"/><circle cx="464" cy="789" r="18" fill="{CREAM}" stroke="none"/>
</g>
<g id="right-arm" fill="none" stroke="{CREAM}" stroke-linecap="round">
  <line x1="648" y1="805" x2="785" y2="790" stroke-width="27"/><circle cx="792" cy="789" r="18" fill="{CREAM}" stroke="none"/>
</g>'''


def image_one_svg(source: Path) -> str:
    data = embedded(source)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1254" height="1254" viewBox="0 0 1254 1254" role="img" aria-label="Robot pulling human strings">
  <defs><clipPath id="robot-crop"><rect width="1254" height="650"/></clipPath></defs>
  <rect id="background" x="0" y="0" width="1254" height="1254" rx="150" fill="{INK}"/>
  <image id="robot-raster" x="0" y="0" width="1254" height="1254" preserveAspectRatio="xMidYMid meet" clip-path="url(#robot-crop)" href="data:image/png;base64,{data}" xlink:href="data:image/png;base64,{data}"/>
  <g id="stage" fill="none" stroke-linecap="round">
    <ellipse cx="627" cy="1000" rx="286" ry="76" stroke="{ORANGE}" stroke-width="10"/>
    <ellipse cx="627" cy="1000" rx="166" ry="42" stroke="{BLUE}" stroke-width="7"/>
    <path d="M627 920V1080 M320 1000H934 M410 1070L500 1018 M844 1070L754 1018" stroke="{BLUE}" stroke-width="5" opacity=".9"/>
  </g>
  <g id="strings" fill="none" stroke="{BLUE}" stroke-width="7" stroke-linecap="round">
    <line id="center-string" x1="627" y1="525" x2="627" y2="701"/>
    <line id="left-string-top" x1="465" y1="525" x2="465" y2="708"/>
    <line id="right-string-top" x1="790" y1="525" x2="790" y2="708"/>
    <line id="left-string-lower" x1="465" y1="708" x2="465" y2="789"/>
    <line id="right-string-lower" x1="790" y1="708" x2="790" y2="789"/>
  </g>
  {human_svg()}
</svg>\n'''


def board_slots() -> str:
    slots = [(105, 690, 250, 165), (400, 690, 250, 165), (700, 690, 250, 165), (105, 885, 250, 165), (400, 885, 250, 165), (700, 885, 250, 165)]
    result = []
    for x, y, w, h in slots:
        result.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="20"/>')
        result.append(f'<path d="M{x + 94} {y + 112}h62v34h-62z"/>')
    return "\n".join(result)


def image_two_svg(source: Path) -> str:
    data = embedded(source)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1254" height="1254" viewBox="0 0 1254 1254" role="img" aria-label="Robot moving a human between work slots">
  <defs><clipPath id="robot-crop"><rect width="1254" height="570"/></clipPath></defs>
  <rect id="background" x="0" y="0" width="1254" height="1254" rx="150" fill="{INK}"/>
  <image id="robot-raster" x="0" y="0" width="1254" height="1254" preserveAspectRatio="xMidYMid meet" clip-path="url(#robot-crop)" href="data:image/png;base64,{data}" xlink:href="data:image/png;base64,{data}"/>
  <g id="slots" fill="none" stroke="{BLUE}" stroke-width="13" stroke-linejoin="round">{board_slots()}</g>
  <rect id="target-slot" x="502" y="878" width="250" height="165" rx="20" fill="none" stroke="{ORANGE}" stroke-width="13"/>
  <g id="gripper" fill="none" stroke="{BLUE}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path id="gripper-arm" d="M793 420L944 520L627 665"/>
    <circle cx="944" cy="520" r="32"/>
    <path id="gripper-jaw-left" d="M627 665l-42 54 42 28"/>
    <path id="gripper-jaw-right" d="M627 665l42 54-42 28"/>
  </g>
  <g id="carried-human" fill="{CREAM}" stroke="{CREAM}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="627" cy="748" r="31" stroke="none"/>
    <rect x="592" y="784" width="70" height="116" rx="24" stroke="none"/>
    <line x1="610" y1="892" x2="610" y2="1005" stroke-width="34"/>
    <line x1="644" y1="892" x2="644" y2="1005" stroke-width="34"/>
  </g>
</svg>\n'''


CSS_ONE = f'''\
:root {{ --p2m-duration: 2400ms; }}
#logo, #stage, #strings, #human {{ transform: none; }}
#left-arm, #left-string-lower, #right-arm, #right-string-lower {{ transform-box: fill-box; transform-origin: center; }}
#left-arm {{ animation: p2m-left-double var(--p2m-duration) linear infinite both; }}
#left-string-lower {{ animation: p2m-left-string var(--p2m-duration) linear infinite both; transform-origin: 50% 0%; }}
#right-arm {{ animation: p2m-right-single var(--p2m-duration) linear infinite both; }}
#right-string-lower {{ animation: p2m-right-string var(--p2m-duration) linear infinite both; transform-origin: 50% 0%; }}
@keyframes p2m-left-double {{
  0%, 15% {{ transform: translateY(0); }}
  19% {{ transform: translateY(-76px) rotate(-10deg); }}
  24% {{ transform: translateY(0); }}
  29% {{ transform: translateY(-64px) rotate(-8deg); }}
  35%, 100% {{ transform: translateY(0); }}
}}
@keyframes p2m-left-string {{
  0%, 15% {{ transform: scaleY(1); }}
  19% {{ transform: scaleY(.06); }}
  24% {{ transform: scaleY(1); }}
  29% {{ transform: scaleY(.18); }}
  35%, 100% {{ transform: scaleY(1); }}
}}
@keyframes p2m-right-single {{
  0%, 39% {{ transform: translateY(0); }}
  44% {{ transform: translateY(-78px) rotate(10deg); }}
  51% {{ transform: translateY(0); }}
  51%, 100% {{ transform: translateY(0); }}
}}
@keyframes p2m-right-string {{
  0%, 39% {{ transform: scaleY(1); }}
  44% {{ transform: scaleY(.04); }}
  51%, 100% {{ transform: scaleY(1); }}
}}
'''


CSS_TWO = f'''\
:root {{ --p2m-duration: 2400ms; }}
#logo, #background, #robot-raster, #slots, #target-slot {{ transform: none; }}
#carried-human, #gripper {{ transform-box: view-box; transform-origin: 627px 748px; }}
#target-slot {{ transform-box: view-box; transform-origin: 627px 960px; animation: p2m-target-slot var(--p2m-duration) cubic-bezier(0.16, 1, 0.3, 1) infinite both; }}
#carried-human {{ animation: p2m-carry-human var(--p2m-duration) cubic-bezier(0.16, 1, 0.3, 1) infinite both; }}
#gripper {{ animation: p2m-carry-gripper var(--p2m-duration) cubic-bezier(0.16, 1, 0.3, 1) infinite both; }}
@keyframes p2m-carry-human {{
  0%, 15% {{ transform: translate(0, 0); }}
  24% {{ transform: translate(0, -70px); }}
  50% {{ transform: translate(-270px, -30px); }}
  65% {{ transform: translate(-270px, -30px); }}
  82% {{ transform: translate(0, -70px); }}
  92%, 100% {{ transform: translate(0, 0); }}
}}
@keyframes p2m-carry-gripper {{
  0%, 15% {{ transform: translate(0, 0) scale(1); }}
  24% {{ transform: translate(0, -70px) scale(.88); }}
  50% {{ transform: translate(-270px, -30px) scale(.88); }}
  58% {{ transform: translate(-270px, -30px) scale(1.06); }}
  65% {{ transform: translate(-270px, -30px) scale(1.12); }}
  82% {{ transform: translate(0, -70px) scale(.88); }}
  92%, 100% {{ transform: translate(0, 0) scale(1); }}
}}
@keyframes p2m-target-slot {{
  0%, 15% {{ transform: translate(0, 0); }}
  24% {{ transform: translate(0, -70px); }}
  50%, 65% {{ transform: translate(-270px, -30px); }}
  82% {{ transform: translate(0, -70px); }}
  92%, 100% {{ transform: translate(0, 0); }}
}}
'''


def main() -> None:
    configs = [
        ("human-control", ROOT / "design" / "source-art" / "human-control.png", image_one_svg, CSS_ONE),
        ("dispatch-board", ROOT / "design" / "source-art" / "dispatch-board.png", image_two_svg, CSS_TWO),
    ]
    for slug, source, svg_builder, css in configs:
        out = OUT / slug
        (out / "logo.svg").write_text(svg_builder(source), encoding="utf-8")
        (out / "motion.css").write_text(css, encoding="utf-8")
        (out / "motion_spec.md").write_text((out / "motion_spec.md").read_text(encoding="utf-8") + "\n## Local choreography update\n\nThis revision removes whole-frame shake. The motion is restricted to semantic local actors: strings and arms for `human-control`, and the carried human plus gripper for `dispatch-board`. The 0% and 100% keyframes are identical for seamless looping.\n", encoding="utf-8")


if __name__ == "__main__":
    main()
