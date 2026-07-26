import asyncio
import traceback
from app.proxy import submit_image_task

async def main():
    prompt = "A cute puppy playing in the grass"
    
    # 1. 测试文生图 (text-to-image)
    print("--- 1. Testing Text-to-Image (image_urls=None) ---")
    try:
        task_id = await submit_image_task(
            prompt=prompt,
            size="4:3",
            resolution="1k",
            image_urls=None
        )
        print(f"Text-to-Image submission successful! Task ID: {task_id}")
    except Exception as e:
        print("Text-to-Image submission failed:")
        traceback.print_exc()
        
    # 2. 测试图生图 (image-to-image with a mock/real apimart uploaded URL)
    print("\n--- 2. Testing Image-to-Image (with uploaded ref URL) ---")
    ref_url = "https://upload.apib.ai/f/image/9998218238469307-3c1779f4-7863-4f3d-8514-ae0ebb04b45c-ref.png"
    try:
        task_id = await submit_image_task(
            prompt=prompt,
            size="1:1",
            resolution="1k",
            image_urls=[ref_url]
        )
        print(f"Image-to-Image submission successful! Task ID: {task_id}")
    except Exception as e:
        print("Image-to-Image submission failed:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
