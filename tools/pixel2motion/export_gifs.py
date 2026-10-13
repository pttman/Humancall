from __future__ import annotations

import asyncio
import io
import sys
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright


async def export(html: Path, out: Path) -> None:
    frames = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        page = await browser.new_page(viewport={"width": 560, "height": 560}, device_scale_factor=1)
        for timestamp in range(0, 2401, 40):
            await page.goto(html.resolve().as_uri() + f"?t={timestamp}")
            data = await page.locator("#logo-root").screenshot()
            frames.append(Image.open(io.BytesIO(data)).convert("RGBA"))
        await browser.close()
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=40, loop=0, disposal=2, optimize=False)
    print(f"{out}: {len(frames)} frames, first_last_exact={frames[0].tobytes() == frames[-1].tobytes()}")


if __name__ == "__main__":
    asyncio.run(export(Path(sys.argv[1]), Path(sys.argv[2])))
