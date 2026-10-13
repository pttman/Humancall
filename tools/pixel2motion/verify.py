from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright


async def verify(html: Path, out: Path) -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        page = await browser.new_page(viewport={"width": 900, "height": 900}, device_scale_factor=1)
        captures = {}
        for name, query in (("static", "?static=1"), ("end", "?t=2400")):
            await page.goto(html.resolve().as_uri() + query)
            await page.locator("#logo-root").screenshot(path=out / f"qa_{name}.png")
            captures[name] = Image.open(out / f"qa_{name}.png").convert("RGBA")
        await browser.close()
    diff = ImageChops.difference(captures["static"], captures["end"])
    report = {
        "static_vs_end_exact": diff.getbbox() is None,
        "diff_bbox": diff.getbbox(),
        "size": captures["static"].size,
    }
    (out / "final_frame_contract.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(verify(Path(sys.argv[1]), Path(sys.argv[2])))
