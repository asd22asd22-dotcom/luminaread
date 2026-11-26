import importlib.util
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN_ICON_PATH = os.path.join(ROOT, "scripts", "generate-icon.py")
RES_DIR = os.path.join(ROOT, "web", "android", "app", "src", "main", "res")

spec = importlib.util.spec_from_file_location("generate_icon", GEN_ICON_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def main():
    base_icon = mod.create_liquid_glass_icon(512)

    for folder, size in MIPMAP_SIZES.items():
        target_dir = os.path.join(RES_DIR, folder)
        os.makedirs(target_dir, exist_ok=True)
        resized = base_icon.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(os.path.join(target_dir, "ic_launcher.png"), format="PNG")
        resized.save(os.path.join(target_dir, "ic_launcher_round.png"), format="PNG")

    for folder, size in FOREGROUND_SIZES.items():
        target_dir = os.path.join(RES_DIR, folder)
        os.makedirs(target_dir, exist_ok=True)
        canvas = Image.new("RGBA", (size, size), (7, 11, 24, 255))
        inset = int(size * 0.70)
        icon_fg = base_icon.resize((inset, inset), Image.Resampling.LANCZOS)
        offset = (size - inset) // 2
        canvas.alpha_composite(icon_fg, (offset, offset))
        canvas.save(os.path.join(target_dir, "ic_launcher_foreground.png"), format="PNG")

    print(f"Generated Android mipmap icons into {RES_DIR}")


if __name__ == "__main__":
    main()
