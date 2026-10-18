"""Read-only local measurements. Authentication credentials never leave memory."""
import asyncio, json, logging, statistics, time
from datetime import timedelta
import httpx
from sqlalchemy import text
from app.api.auth import create_access_token
from app.database import async_session_maker, engine

async def main():
    logging.disable(logging.CRITICAL)
    async with async_session_maker() as db:
        await db.execute(text('SET TRANSACTION READ ONLY'))
        row=(await db.execute(text("SELECT u.id,i.id AS iid FROM users u JOIN user_identities i ON i.user_id=u.id WHERE u.email=:email ORDER BY i.created_at LIMIT 1"), {'email':'demo@wardrowbe.local'})).mappings().one()
        token=create_access_token(row['id'],row['iid'],timedelta(minutes=3))
        await db.rollback()
    out={'scope':'GET only; existing demonstration account; no generation or data writes','measurements':{}}
    async with httpx.AsyncClient(base_url='http://frontend:3000/api/v1',headers={'Authorization':f'Bearer {token}'},timeout=45) as client:
        for label,path in [('profile','/users/me'),('inventory','/items?page=1&page_size=100&status=ready&is_archived=false&sort_by=created_at&sort_order=desc'),('capabilities','/tryon/capabilities'),('tasks','/tryon/tasks?limit=20')]:
            times=[]
            for _ in range(5):
                start=time.perf_counter();r=await client.get(path);times.append(round((time.perf_counter()-start)*1000,2));r.raise_for_status()
            out['measurements'][label]={'ms':times,'median_ms':statistics.median(times),'bytes':len(r.content)}
            if label=='tasks': tasks=r.json()['items']
        paths=[t['result_url'] for t in tasks if t['status']=='succeeded' and t['result_url']]
        async def image(path):
            start=time.perf_counter();r=await client.get(path.removeprefix('/api/v1'));r.raise_for_status()
            return {'ms':round((time.perf_counter()-start)*1000,2),'bytes':len(r.content),'cache_control':r.headers.get('cache-control')}
        start=time.perf_counter();rows=await asyncio.gather(*(image(p) for p in paths))
        out['history_images']={'count':len(paths),'parallel_total_ms':round((time.perf_counter()-start)*1000,2),'total_bytes':sum(r['bytes'] for r in rows),'samples':rows}
    await engine.dispose()
    print(json.dumps(out,indent=2))
asyncio.run(main())
