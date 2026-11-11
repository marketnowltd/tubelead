"""Builds the TubeLead Helper animation assets from the official character sheet.

Source: docs/brand/tubelead-helper-character-sheet.png ("TubeLead Helper – Official 2D Character & Animation Guide").
Every frame is cut from that artwork; nothing is redrawn. Backgrounds are removed by flood-filling the sheet's
lavender panel from the crop edges (the character's outline stops the fill), with anti-aliased edges.

Derived frames (built from the same pixels):
- poses mirrored for left-facing moves, with the chest logo copied back unmirrored so the logo is never reversed
- full-body expressions: a visor emote head placed on the front-view body (head and body are separate layers)
- a blink frame: the eyes of the front view replaced by a thin closed-eye line

Run: PYTHONPATH=<dir with scipy> python3 frontend/scripts/helper_assets.py   (needs Pillow, numpy, scipy)
Output: frontend/public/helper/*.webp and frontend/components/helper/sprites.json (sizes and anchors)."""
from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHEET = os.path.join(ROOT, "docs/brand/tubelead-helper-character-sheet.png")
OUT = os.path.join(ROOT, "frontend/public/helper")
META = os.path.join(ROOT, "frontend/components/helper/sprites.json")
T = 20.0  # colour distance from the panel background that still counts as background

# name: (left, top, right, bottom) in sheet pixels — generous boxes that stop above each label pill
BOXES = {
    "hero": (262, 22, 715, 700),
    "front": (760, 72, 885, 268), "front34": (925, 72, 1040, 268), "side": (1078, 72, 1182, 268),
    "back34": (1222, 72, 1330, 268), "back": (1372, 72, 1492, 268),
    "wave": (1028, 382, 1130, 514), "point": (1162, 382, 1268, 514), "present": (1272, 382, 1398, 514), "explain": (1400, 382, 1520, 514),
    "thinking": (1040, 548, 1138, 657), "idea": (1158, 545, 1262, 657), "celebrate": (1278, 548, 1392, 657), "success": (1405, 548, 1518, 657),
    "e_happy": (588, 418, 680, 498), "e_excited": (690, 418, 783, 498), "e_thinking": (793, 418, 885, 498), "e_curious": (895, 410, 998, 498),
    "e_surprised": (588, 540, 685, 622), "e_winking": (690, 545, 783, 622), "e_confident": (793, 545, 885, 622), "e_helpful": (895, 540, 1000, 622),
    "sign": (38, 770, 232, 985), "laptop": (255, 795, 445, 955), "checklist": (452, 790, 668, 945), "typing": (685, 790, 840, 950),
    "sleeping": (915, 795, 1030, 915), "loading": (1035, 810, 1140, 900),
}


MIN_PART = {"hero": 400}  # smallest separate part kept (decorations are larger than stray text)
ERASE = {  # areas of a box that belong to neighbouring artwork (sheet coordinates)
    "hero": [(580, 340, 715, 700), (262, 22, 293, 470), (690, 22, 715, 160)],
}


def cutout(im: Image.Image, box, name: str = "") -> Image.Image:
    src = im.crop(box).convert("RGB")
    a = np.asarray(src).astype(np.float32)
    if name in ERASE:
        b0 = np.median(np.concatenate([a[0], a[:, 0]]), axis=0)
        for l, t, r, bt in ERASE[name]:
            a[max(0, t - box[1]): bt - box[1], max(0, l - box[0]): r - box[0]] = b0
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    lum = a.mean(-1)
    chroma = a.max(-1) - a.min(-1)
    # panel colour, and the soft lavender drop shadows under the feet (light, low saturation, purple-leaning)
    shadowish = (lum > 196) & (chroma < 46) & (a[..., 2] >= a[..., 1] + 2)
    cand = (dist < T) | shadowish
    lab, _ = ndi.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    fg = ~bgmask
    # drop specks; keep the character and its decorations (question mark, bulb, stars, motion lines, Z's)
    flab, n = ndi.label(fg)
    if n:
        sizes = ndi.sum(fg, flab, range(1, n + 1))
        keep = np.isin(flab, [i + 1 for i, s in enumerate(sizes) if s >= MIN_PART.get(name, 25)])
        fg = keep
    fg = ndi.binary_fill_holes(fg) | fg
    # soft edge: a 1px ring outside the shape gets partial alpha from its colour distance
    ring = ndi.binary_dilation(fg, iterations=1) & ~fg
    alpha = fg.astype(np.float32)
    alpha[ring] = np.clip(dist[ring] / (T * 2.2), 0, 0.85)
    inner = fg & ~ndi.binary_erosion(fg, iterations=1)
    alpha[inner] = np.maximum(0.55, np.clip(dist[inner] / (T * 1.4), 0, 1))
    al = alpha[..., None]
    rgb = np.where(al > 0, (a - (1 - al) * bg) / np.maximum(al, 1e-3), 0)
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    return img.crop(img.getbbox())


def logo_box(img: Image.Image):
    """The chest logo: the warm orange/pink pixels on the white chest, below the helmet."""
    a = np.asarray(img).astype(int)
    h = a.shape[0]
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    warm = (al > 200) & (r > 200) & (g > 70) & (g < 190) & (b < 140)
    warm[: int(h * 0.30)] = False  # skip the headphones
    warm[int(h * 0.75):] = False
    lab, n = ndi.label(ndi.binary_dilation(warm, iterations=3))
    if not n:
        return None
    sizes = ndi.sum(warm, lab, range(1, n + 1))
    best = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lab == best)
    pad = 3
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), xs.max() + pad + 1, ys.max() + pad + 1)


def mirror_keep_logo(img: Image.Image) -> Image.Image:
    m = img.transpose(Image.FLIP_LEFT_RIGHT)
    box = logo_box(img)
    if box:
        l, t, r, b = box
        patch = img.crop(box)
        m.paste(patch, (img.width - r, t), patch)
    return m


def visor_glow(img: Image.Image) -> np.ndarray:
    """Bright eye/mouth glyph pixels inside the dark visor."""
    a = np.asarray(img).astype(int)
    lum = a[..., :3].mean(-1)
    dark = (lum < 70) & (a[..., 3] > 200)
    dark[int(a.shape[0] * 0.42):] = False  # the visor is in the helmet, the top of the front view
    vis = ndi.binary_fill_holes(ndi.binary_closing(dark, iterations=3))
    lab, n = ndi.label(vis)
    if not n:
        return np.zeros(lum.shape, bool)
    sizes = ndi.sum(vis, lab, range(1, n + 1))
    vis = lab == int(np.argmax(sizes)) + 1
    glyph = vis & (lum > 120)
    return ndi.binary_dilation(glyph, iterations=2) & vis, vis


def blink(img: Image.Image) -> Image.Image:
    """Front view with closed eyes: the two eye glyphs are filled with the surrounding visor colour and replaced by
    a short soft glowing line each (the visor's gloss highlights are left untouched)."""
    from PIL import ImageDraw
    glyph, vis = visor_glow(img)
    lab, n = ndi.label(glyph)
    if n < 2:
        return img
    sizes = ndi.sum(glyph, lab, range(1, n + 1))
    eyes = [int(i) + 1 for i in np.argsort(sizes)[::-1][:2]]
    mask = np.isin(lab, eyes)
    a = np.asarray(img).astype(np.float32).copy()
    idx = ndi.distance_transform_edt(mask, return_distances=False, return_indices=True)
    a[mask] = a[idx[0][mask], idx[1][mask]]
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
    layer = Image.new("RGBA", out.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for e in eyes:
        ys, xs = np.where(lab == e)
        cy = int(round(ys.mean())) + 1
        d.line([(int(xs.min()) + 1, cy), (int(xs.max()) - 1, cy)], fill=(232, 236, 255, 255), width=1)
    out = Image.alpha_composite(out, layer.filter(ImageFilter.GaussianBlur(1.2)))
    return Image.alpha_composite(out, layer)


def head_on_body(head: Image.Image, body: Image.Image) -> tuple[Image.Image, dict]:
    """Place a visor emote head on the front-view body, scaled to the body's own helmet width."""
    a = np.asarray(body)
    rows = np.where(a[..., 3] > 128)[0]
    # helmet: the top ~42% of the front view
    hb = int(body.height * 0.43)
    top = body.crop((0, 0, body.width, hb))
    bb = top.getbbox()
    hw = bb[2] - bb[0]
    hh_img = head.crop(head.getbbox())
    # emote crops include decorations (?, sparkles); measure the helmet as the widest opaque run in the middle rows
    ha = np.asarray(hh_img)[..., 3] > 128
    mid = ha[int(ha.shape[0] * 0.35): int(ha.shape[0] * 0.75)]
    cols = np.where(mid.any(0))[0]
    # helmet span: longest contiguous column run
    runs, start = [], cols[0]
    for i in range(1, len(cols)):
        if cols[i] != cols[i - 1] + 1:
            runs.append((start, cols[i - 1])); start = cols[i]
    runs.append((start, cols[-1]))
    l, r = max(runs, key=lambda x: x[1] - x[0])
    scale = hw / (r - l + 1)
    sh = hh_img.resize((max(1, round(hh_img.width * scale)), max(1, round(hh_img.height * scale))), Image.LANCZOS)
    hrows = np.where((np.asarray(hh_img)[..., 3] > 128)[:, l:r + 1].any(1))[0]
    helmet_top = int(hrows[0] * scale)
    canvas_h = max(body.height, body.height + 0)
    pad_top = max(0, helmet_top * 0 + (sh.height - hb) if False else 0)
    out = Image.new("RGBA", (max(body.width, sh.width + bb[0] * 2), body.height + 30), (0, 0, 0, 0))
    ox = (out.width - body.width) // 2
    out.paste(body, (ox, 30), body)
    hx = ox + bb[0] - round(l * scale)
    hy = 30 + bb[1] - helmet_top
    out.alpha_composite(sh, (max(0, hx), max(0, hy)))
    out = out.crop(out.getbbox())
    return out, {}


def save(img: Image.Image, name: str, meta: dict, scale: float, unit: float):
    """unit: the character's full height in sheet pixels for this frame's group, so every frame can be shown with the
    character at the same size (k = character heights per image pixel)."""
    if scale != 1.0:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    img.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=92, method=6)
    meta[name] = {"w": img.width, "h": img.height, "k": round(1 / (unit * scale), 6)}


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.open(SHEET).convert("RGB")
    cut = {k: cutout(sheet, b, k) for k, b in BOXES.items()}
    meta: dict = {}
    h_front, h_key, h_hero = cut["front"].height, cut["point"].height, cut["hero"].height
    for k in ("front", "front34", "side", "back34", "back"):
        save(cut[k], k, meta, 2.0, h_front)
    for k in ("wave", "point", "present", "explain", "thinking", "idea", "celebrate", "success", "sign", "laptop", "checklist", "typing", "sleeping"):
        save(cut[k], k, meta, 2.0, h_key)
    for k in ("point", "wave", "present", "explain"):
        save(mirror_keep_logo(cut[k]), f"{k}_l", meta, 2.0, h_key)
    for k in ("side", "front34"):
        save(mirror_keep_logo(cut[k]), f"{k}_l", meta, 2.0, h_front)
    save(cut["hero"], "hero", meta, 0.5, h_hero)
    save(blink(cut["front"]), "front_blink", meta, 2.0, h_front)
    heads = {k: cut[k] for k in cut if k.startswith("e_")}
    heads["e_loading"] = cut["loading"]
    for k, head in heads.items():
        save(head, k, meta, 2.0, h_front)
        body, _ = head_on_body(head, cut["front"])
        save(body, f"f_{k[2:]}", meta, 2.0, h_front)
    os.makedirs(os.path.dirname(META), exist_ok=True)
    with open(META, "w") as f:
        json.dump(meta, f, indent=1, sort_keys=True)
    print(len(meta), "frames →", OUT)


if __name__ == "__main__":
    sys.exit(main())
