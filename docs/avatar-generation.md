# 默认头像生成记录

生成方式：内置 imagegen 工具（built-in mode），生成两张独立的非写实手绘插画。角色均为虚构人物，不对应真实用户。

本地资源：`frontend/avatars/zhixu.png` 和 `frontend/avatars/user.png`。两张头像采用彩铅轮廓与水粉笔触，分别使用绿色和蓝色配色。仅替换默认头像，用户已经上传的自定义头像继续保留。

生成原图保留在 Codex generated_images 目录。此版本仅在本地更新，未发布 GitHub。

## 知序

```text
Use case: illustration-story. Asset type: one square illustrated WeChat profile avatar for a fictional work companion called Zhixu. Create a polished, expressive 2D hand-painted character portrait, unmistakably an illustration, not a photograph and not a realistic human likeness. One fictional adult character with a loosely drawn short dark bob tucked behind one ear, expressive dark eyes, slightly raised eyebrow and a small genuine, engaging smile. Green casual sweater. Warm, thoughtful and approachable personality, like a character in a well-drawn slice-of-life graphic novel. Use visible colored-pencil contours, layered matte gouache brushwork, simplified painted facial planes, stylized proportions and lively hand-drawn details. Cream and muted leafy-green background with just a few abstract brushstroke hints of a home study. Centered head and shoulders; make the face large and clear at tiny chat-avatar size, preserve modest breathing room around hair, eye line in the upper third, 1:1 composition. Rich enough to feel authored and personal, rather than a generic flat vector icon. Soft illustrated daylight and restrained shading. Absolutely no photography, photorealism, skin pores, lifelike skin rendering, photographic lens blur, 3D render, robots, logos, letters, text, watermark, UI frame or collage. This must read immediately as a drawn fictional character.
```

## 用户

```text
Use case: illustration-story. Asset type: one square illustrated default user avatar for a Chinese desktop chat app. Create a polished and expressive 2D hand-painted portrait of a fictional adult character with an understated androgynous appearance, naturally tousled short dark hair, open attentive illustrated eyes and a relaxed, slightly playful smile. Casual navy-blue shirt, easy everyday posture. A clearly invented graphic-novel character, not a likeness of the real user. Use visible colored-pencil outlines and textured matte gouache brushwork, simplified facial planes and stylized expressive proportions; immediately recognizable as a drawing, not a photograph. Give it a personal, lived-in, friendly feeling with small asymmetries in hair and smile; avoid a sterile generic vector-person icon. Quiet pale blue and cream background with a few hand-painted leaf shapes, keeping the face visually dominant. Centered head-and-shoulders, face large enough to read at 40px, eyes near the upper third, all hair inside square with modest crop breathing room, 1:1 image. Match the warmth and craft of a green-sweater illustrated companion avatar while keeping a distinctly different face, hairstyle and blue palette. Absolutely no photography, photorealism, realistic skin texture or pores, photographic lens blur, 3D render, robots, text, logo, watermark, UI border, paired portraits or collage.
```


## 陆野：第二位 AI 朋友

使用内置 imagegen（built-in mode）生成新的非写实手绘插画，保留原图，项目资源保存为 `frontend/avatars/luye.png`。暖橘色、松弛略带坏笑的虚构人物，与知序的绿色头像区分。当前版本号保持 0.1.17，仅本地更新。

最终生成提示词：

```text
Use case: illustration-story. Asset type: square avatar for a fictional Chinese AI chat friend named Lu Ye. Primary request: a lively clearly drawn adult male character, relaxed and witty, a little mischievous but kind; NOT a photograph and NOT a portrait of any real person. Subject: wavy medium-short dark hair swept loosely backward, distinctive narrow smiling eyes, small expressive eyebrows, one corner of the mouth raised, relaxed head tilt, rust orange casual jacket over cream T-shirt. Style: 2D hand-painted gouache illustration with rough colored-pencil contours, obvious matte brush strokes and paper texture, simplified graphic facial planes and gently stylized proportions, like a contemporary slice-of-life graphic novel. Composition: a single centered head and shoulders, large readable face, hair fully within the square; no hands needed, no collage. Background: simple warm cream and muted terracotta painted shapes, a few soft abstract sunset shapes, understated. Mood: friendly irreverent easygoing personality, full of life, an individual rather than a generic icon. Must remain legible at small WeChat avatar size. Avoid photorealism, photographs, skin pores, photo lens blur, glossy 3D, robot, chibi, yellow emoji faces, words, letters, branding, watermarks, frames, interface.
```

陆野的默认人物介绍、签名与角色提示词保存于 `frontend/friends.js` 的 `presets.luye` 和 `LUYE_PROMPT`，可在应用中点击陆野头像继续修改。
