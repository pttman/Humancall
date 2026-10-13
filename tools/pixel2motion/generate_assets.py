from __future__ import annotations

import base64
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = ROOT / "design" / "animations" / "pixel2motion_outputs"

ASSETS = [
    {
        "slug": "human-control",
        "title": "Human Control · Human Dispatch",
        "source": ROOT / "design" / "source-art" / "human-control.png",
        "personality": "commanding, engineered, alert",
        "description": "The robot is the controller and the human is the dispatched actor. The motion uses a restrained command pulse, a slight control-ring sweep, and a return to the exact resting frame.",
    },
    {
        "slug": "dispatch-board",
        "title": "Dispatch Board · Human Dispatch",
        "source": ROOT / "design" / "source-art" / "dispatch-board.png",
        "personality": "precise, supervisory, decisive",
        "description": "The robot assigns a human to a highlighted slot. The motion uses a measured supervisory pulse and a brief orange focus sweep, then returns exactly to the same static icon.",
    },
]


MOTION_CSS = """\
:root {
  --p2m-duration: 2400ms;
  --p2m-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --p2m-ease-settle: cubic-bezier(0.4, 0, 0.2, 1);
  --p2m-ease-narrative: cubic-bezier(0.34, 0, 0.14, 1);
}

#logo {
  transform-box: fill-box;
  transform-origin: center;
  transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  animation: p2m-command-loop var(--p2m-duration) var(--p2m-ease-narrative) infinite both;
  will-change: transform;
}

#raster-mark {
  transform-box: fill-box;
  transform-origin: center;
  animation: p2m-mark-breath var(--p2m-duration) var(--p2m-ease-settle) infinite both;
}

#sheen {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: p2m-focus-sweep var(--p2m-duration) linear infinite both;
  pointer-events: none;
}

/* One shared 2400ms clock. 0% and 100% are deliberately identical. */
@keyframes p2m-command-loop {
  0%   { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
  20%  { transform: translate3d(0, 2px, 0) scale(0.988) rotate(0deg); }
  50%  { transform: translate3d(0, -3px, 0) scale(1.018) rotate(-0.45deg); }
  68%  { transform: translate3d(0, 1px, 0) scale(1.006) rotate(0.18deg); }
  82%  { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
  100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
}

@keyframes p2m-mark-breath {
  0%, 100% { transform: scale(1); }
  20%      { transform: scale(0.995); }
  52%      { transform: scale(1.008); }
  82%      { transform: scale(1); }
}

@keyframes p2m-focus-sweep {
  0%, 18%, 100% { opacity: 0; transform: translateX(-720px); }
  42%           { opacity: 0.16; transform: translateX(0); }
  62%, 82%      { opacity: 0; transform: translateX(720px); }
}

"""


def make_svg(source: Path, out_path: Path) -> None:
    from PIL import Image

    image = Image.open(source)
    width, height = image.size
    encoded = base64.b64encode(source.read_bytes()).decode("ascii")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Human Dispatch animated mark">
  <defs>
    <linearGradient id="sheen-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="mark-clip"><rect width="{width}" height="{height}" rx="150" ry="150"/></clipPath>
  </defs>
  <g id="logo">
    <image id="raster-mark" x="0" y="0" width="{width}" height="{height}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{encoded}" xlink:href="data:image/png;base64,{encoded}"/>
    <rect id="sheen" x="-{width // 2}" y="-{height // 2}" width="{width // 2}" height="{height * 2}" fill="url(#sheen-gradient)" clip-path="url(#mark-clip)"/>
  </g>
</svg>\n'''
    out_path.write_text(svg, encoding="utf-8")


def make_spec(item: dict, out_path: Path) -> None:
    out_path.write_text(f'''# Motion Spec — {item["title"]}

## Source

- Raster source: `{item["source"].name}`
- Source dimensions: 1254 × 1254 RGBA
- Delivery approach: raster-anchored SVG wrapper so the detailed source artwork remains pixel-faithful while the semantic `#logo`, `#raster-mark`, and `#sheen` actors remain motion-addressable.

## Motion brief

- Personality: {item["personality"]}
- Usage: ambient taskbar/app identity loop; it should be readable as a repeated, non-annoying loop.
- Choreography: {item["description"]}
- Three words: command, focus, settle.

## Timeline

| Time | Phase | Motion |
|---:|---|---|
| 0–480ms | anticipation | Slight compression and downward preparation |
| 480–1200ms | action | Controlled lift, tiny scale emphasis and focus sweep |
| 1200–1968ms | follow-through | Soft counter-rotation and settle |
| 1968–2400ms | rest | Exact static pose held before loop seam |

## Loop contract

The animation uses one shared 2400ms clock. The computed transform and opacity states at 0% and 100% are identical: scale 1, rotation 0, translation 0, sheen opacity 0. The final frame is therefore the same static pose as the first frame and is safe for loop playback.

## Principles applied

- Staging: the mark remains the focus; the sheen is secondary.
- Anticipation: a restrained 20% compression beat prepares the pulse.
- Slow in / slow out: authored cubic easing is used for the main command pulse.
- Follow-through: the small counter-rotation resolves before the static hold.
- Appeal: amplitude is deliberately low for repeated playback.

## QA plan

- Capture `t=0`, `480`, `1200`, `1680`, `2280`, and `2400` ms.
- Compare the same-pipeline `t=0` and `t=2400` frames pixel-for-pixel.
- Capture `?static=1` and compare it with `?t=2400`.
- Run the easing probe on `#logo:transform` and `#sheen:opacity`.
''', encoding="utf-8")


def main() -> None:
    for item in ASSETS:
        out = OUTPUT_ROOT / item["slug"]
        (out / "outputs" / "fit_iterations").mkdir(parents=True, exist_ok=True)
        (out / "outputs" / "fit_work").mkdir(parents=True, exist_ok=True)
        (out / "outputs" / "motion_frames").mkdir(parents=True, exist_ok=True)
        shutil.copy2(item["source"], out / "source.png")
        make_svg(item["source"], out / "logo.svg")
        (out / "motion.css").write_text(MOTION_CSS, encoding="utf-8")
        make_spec(item, out / "motion_spec.md")
        (out / "outputs" / "fit_work" / "fit_note.json").write_text(json.dumps({
            "method": "raster-anchored semantic SVG wrapper",
            "source": item["source"].name,
            "smoothness_gate": "The source is preserved as an embedded raster artwork; no jagged trace is introduced.",
            "motion_ready_parts": ["logo", "raster-mark", "sheen"],
        }, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
