"""
Get a random quote from the dummyjson.com
and print it to the console.
"""

import asyncio

import js


async def task():
    url = "https://dummyjson.com/quotes/random"
    print(f"Fetching {url}...")
    res = await js.fetch(url)
    data = await res.json()
    print()
    print(data.author, ":", data.quote)


asyncio.create_task(task())
