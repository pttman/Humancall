# Motion Spec — Human Control · Human Dispatch

## Source

- Raster source: `ChatGPT Image 2026年9月23日 17_09_15 (3).png`
- Source dimensions: 1254 × 1254 RGBA
- Delivery approach: raster-anchored SVG wrapper so the detailed source artwork remains pixel-faithful while the semantic `#logo`, `#raster-mark`, and `#sheen` actors remain motion-addressable.

## Motion brief

- Personality: commanding, engineered, alert
- Usage: ambient taskbar/app identity loop; it should be readable as a repeated, non-annoying loop.
- Choreography: The robot is the controller and the human is the dispatched actor. The motion uses a restrained command pulse, a slight control-ring sweep, and a return to the exact resting frame.
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

## Local choreography update

This revision removes whole-frame shake. The motion is restricted to semantic local actors: strings and arms for `human-control`, and the carried human plus gripper for `dispatch-board`. The 0% and 100% keyframes are identical for seamless looping.

## Local choreography update

This revision removes whole-frame shake. The motion is restricted to semantic local actors: strings and arms for `human-control`, and the carried human plus gripper for `dispatch-board`. The 0% and 100% keyframes are identical for seamless looping.

## Local choreography update

This revision removes whole-frame shake. The motion is restricted to semantic local actors: strings and arms for `human-control`, and the carried human plus gripper for `dispatch-board`. The 0% and 100% keyframes are identical for seamless looping.
