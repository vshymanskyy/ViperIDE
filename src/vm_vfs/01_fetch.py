import js
import asyncio

async def task():
    url = "https://dummyjson.com/quotes/random"
    print(f"Fetching {url}...")
    res = await js.fetch(url)
    data = await res.json()
    print(data.author, ":", data.quote)

asyncio.create_task(task())
