"""快速验证脚本：测试 apiyi 图像生成接口（文生图 + 图生图）。

用法：
    cd backend
    uv run python test_apimart.py
"""
import asyncio
import traceback
from app.proxy import run_image_generation


async def main():
    prompt = "A cute puppy playing in the grass"

    # 1. 测试文生图 (text-to-image)
    print("--- 1. Testing Text-to-Image ---")
    try:
        results = await run_image_generation(
            prompt=prompt,
            size="4:3",
            resolution="1k",
        )
        print(f"Text-to-Image OK! Got {len(results)} image(s), mime={results[0].mime}, bytes={len(results[0].bytes_)}")
    except Exception:
        print("Text-to-Image FAILED:")
        traceback.print_exc()

    # 2. 测试图生图（需要本地真实图片，此处用内存中生成的 1x1 PNG 做测试占位）
    print("\n--- 2. Testing Image-to-Image (1px placeholder) ---")
    import base64
    # 最小合法 PNG (1x1 透明)
    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )
    try:
        results = await run_image_generation(
            prompt=prompt,
            size="1:1",
            resolution="1k",
            ref_files=[(tiny_png, "image/png")],
        )
        print(f"Image-to-Image OK! Got {len(results)} image(s), mime={results[0].mime}, bytes={len(results[0].bytes_)}")
    except Exception:
        print("Image-to-Image FAILED:")
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
