#!/usr/bin/env python3
"""
Generate clean PNG icons for API Vault.
Design: dark bg → indigo rounded card → bold white lock icon.
4× supersampling + LANCZOS downscale for smooth edges.
"""
from PIL import Image, ImageDraw
import os


def fill_rounded_rect(draw, x0, y0, x1, y1, r, color):
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=color)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=color)
    for cx, cy in [(x0+r, y0+r), (x1-r, y0+r), (x0+r, y1-r), (x1-r, y1-r)]:
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)


def draw_icon(size):
    S   = size * 4          # superscale
    img = Image.new('RGBA', (S, S), (13, 13, 13, 255))
    d   = ImageDraw.Draw(img)

    # ── Indigo card ─────────────────────────────────────────────────────────
    pad = int(S * 0.07)
    r   = int(S * 0.24)
    fill_rounded_rect(d, pad, pad, S-pad, S-pad, r, (99, 102, 241, 255))

    # ── Lock icon (centred) ─────────────────────────────────────────────────
    W = S - 2 * pad          # card width
    cx = S // 2
    cy = int(S * 0.52)       # slightly below centre

    # Lock body proportions
    bw = int(W * 0.52)       # body width
    bh = int(W * 0.40)       # body height
    br = int(bw * 0.18)      # body corner radius

    bx0 = cx - bw // 2
    by0 = cy - int(bh * 0.05)
    bx1 = cx + bw // 2
    by1 = by0 + bh

    fill_rounded_rect(d, bx0, by0, bx1, by1, br, (255, 255, 255, 255))

    # Shackle (arch on top)
    sw  = int(bw * 0.50)     # shackle outer width
    sh  = int(bw * 0.40)     # shackle height above body
    st  = int(bw * 0.14)     # stroke thickness

    sx0 = cx - sw // 2
    sy0 = by0 - sh
    sx1 = cx + sw // 2
    sy1 = by0 + st           # goes slightly into body

    # Outer arch (white)
    d.arc([sx0, sy0, sx1, sy1 + sh], start=180, end=0,
          fill=(255, 255, 255, 255), width=st)

    # Keyhole: filled circle + teardrop drop
    kc_r = int(bw * 0.10)    # keyhole circle radius
    kx   = cx
    ky   = by0 + int(bh * 0.38)

    d.ellipse([kx-kc_r, ky-kc_r, kx+kc_r, ky+kc_r],
              fill=(99, 102, 241, 255))

    # Teardrop slot below keyhole
    slot_w = int(kc_r * 0.85)
    slot_h = int(bh * 0.28)
    d.rectangle([kx - slot_w // 2, ky, kx + slot_w // 2, ky + slot_h],
                fill=(99, 102, 241, 255))

    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    os.makedirs('icons', exist_ok=True)
    for size in [16, 32, 48, 128]:
        icon = draw_icon(size)
        path = f'icons/icon{size}.png'
        icon.save(path, 'PNG')
        print(f'✅  {path}  ({size}×{size})')
    print('Done.')
