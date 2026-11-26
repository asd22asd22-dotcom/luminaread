import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(ROOT, "desktop", "assets")
os.makedirs(ASSETS_DIR, exist_ok=True)


def create_liquid_glass_icon(size: int = 512) -> Image.Image:
    # Render at 2x for crisp anti-aliasing, then downsample with LANCZOS
    S = size * 2
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # 1. Squircle mask
    mask = Image.new("L", (S, S), 0)
    mask_draw = ImageDraw.Draw(mask)
    pad = int(S * 0.06)
    radius = int(S * 0.22)
    mask_draw.rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius, fill=255)

    # 2. Deep nocturnal base + aurora radial blobs
    bg = Image.new("RGBA", (S, S), (7, 11, 24, 255))

    orbs = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(orbs)
    od.ellipse([int(S * 0.04), int(S * 0.02), int(S * 0.68), int(S * 0.66)], fill=(34, 211, 238, 170))
    od.ellipse([int(S * 0.34), int(S * 0.22), int(S * 0.98), int(S * 0.88)], fill=(129, 140, 248, 170))
    od.ellipse([int(S * 0.22), int(S * 0.42), int(S * 0.86), int(S * 1.02)], fill=(232, 121, 249, 130))
    orbs = orbs.filter(ImageFilter.GaussianBlur(radius=int(S * 0.14)))
    bg = Image.alpha_composite(bg, orbs)

    # 3. Frosted glass inner sheen & specular rim
    sheen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon(
        [(0, 0), (int(S * 0.85), 0), (int(S * 0.35), int(S * 0.72)), (0, int(S * 0.55))],
        fill=(255, 255, 255, 28),
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=int(S * 0.04)))
    bg = Image.alpha_composite(bg, sheen)

    # Apply rounded squircle alpha mask
    bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)

    # Specular border highlight
    border_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border_layer)
    bd.rounded_rectangle(
        [pad, pad, S - pad, S - pad],
        radius=radius,
        outline=(255, 255, 255, 95),
        width=max(4, int(S * 0.012)),
    )
    img = Image.alpha_composite(img, border_layer)

    # 4. Luminous open book + central sparkle prism
    glyph = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glyph)

    cx, cy = S // 2, int(S * 0.54)
    bw = int(S * 0.30)
    bh = int(S * 0.20)
    dip = int(S * 0.04)

    # Left page
    left_page = [
        (cx - int(S * 0.015), cy - bh // 2 + dip),
        (cx - bw, cy - bh // 2 - dip // 2),
        (cx - bw, cy + bh // 2 - dip // 2),
        (cx - int(S * 0.015), cy + bh // 2 + dip),
    ]
    # Right page
    right_page = [
        (cx + int(S * 0.015), cy - bh // 2 + dip),
        (cx + bw, cy - bh // 2 - dip // 2),
        (cx + bw, cy + bh // 2 - dip // 2),
        (cx + int(S * 0.015), cy + bh // 2 + dip),
    ]

    gd.polygon(left_page, fill=(241, 245, 249, 232), outline=(103, 232, 249, 220))
    gd.polygon(right_page, fill=(224, 242, 254, 232), outline=(192, 132, 252, 220))

    # Subtle page lines
    line_w = max(3, int(S * 0.01))
    for i in range(3):
        yy = cy - bh // 4 + i * int(bh * 0.24)
        gd.line(
            [(cx - bw + int(S * 0.05), yy - int(S * 0.01)), (cx - int(S * 0.06), yy + int(S * 0.01))],
            fill=(56, 189, 248, 175),
            width=line_w,
        )
        gd.line(
            [(cx + int(S * 0.06), yy + int(S * 0.01)), (cx + bw - int(S * 0.05), yy - int(S * 0.01))],
            fill=(167, 139, 250, 175),
            width=line_w,
        )

    # Floating iridescent 4-point sparkle above the book
    sx, sy = cx, int(S * 0.30)
    outer = int(S * 0.115)
    inner = int(S * 0.032)
    star_pts = []
    for k in range(8):
        angle = k * math.pi / 4.0 - math.pi / 2.0
        r = outer if k % 2 == 0 else inner
        star_pts.append((sx + r * math.cos(angle), sy + r * math.sin(angle)))

    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow_d = ImageDraw.Draw(glow)
    glow_d.polygon(star_pts, fill=(103, 232, 249, 210))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(S * 0.035)))
    img = Image.alpha_composite(img, glow)

    gd.polygon(star_pts, fill=(255, 255, 255, 250))

    img = Image.alpha_composite(img, glyph)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main():
    icon_512 = create_liquid_glass_icon(512)
    png_path = os.path.join(ASSETS_DIR, "icon.png")
    ico_path = os.path.join(ASSETS_DIR, "icon.ico")
    tray_path = os.path.join(ASSETS_DIR, "tray.png")

    icon_512.save(png_path, format="PNG")
    icon_512.resize((32, 32), Image.Resampling.LANCZOS).save(tray_path, format="PNG")
    icon_512.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Generated icons in {ASSETS_DIR}: icon.png, tray.png, icon.ico")


if __name__ == "__main__":
    main()
