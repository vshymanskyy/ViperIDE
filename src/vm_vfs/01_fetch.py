import js
import asyncio

async def task():
    url = "https://api.github.com/users/micropython"
    print(f"Fetching {url}...")
    res = await js.fetch(url)
    data = await res.json()
    for i in dir(data):
        print(f"{i}: {data[i]}")

asyncio.create_task(task())
