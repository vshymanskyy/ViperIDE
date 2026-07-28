import js
import asyncio

async def task():
    url = "https://dummyjson.com/quotes/1"
    print(f"Fetching {url}...")
    res = await js.fetch(url)
    data = await res.json()
    print(data.author, ":", data.quote)

asyncio.create_task(task())
