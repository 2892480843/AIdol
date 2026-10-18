"""Read-only timing of SDK setup versus an existing result read; no paths/secrets printed."""
import asyncio,json,logging,time
from sqlalchemy import text
from app.database import async_session_maker,engine
from app.storage import create_storage
async def main():
 logging.disable(logging.CRITICAL)
 async with async_session_maker() as db:
  await db.execute(text('SET TRANSACTION READ ONLY'))
  path=(await db.execute(text("SELECT t.result_path FROM try_on_tasks t JOIN users u ON u.id=t.user_id WHERE u.email=:email AND t.status='succeeded' ORDER BY t.created_at DESC LIMIT 1"),{'email':'demo@wardrowbe.local'})).scalar_one()
  await db.rollback()
 report={'construct_ms':[],'same_client_read_ms':[]}
 for _ in range(5):
  start=time.perf_counter();storage=create_storage();report['construct_ms'].append(round(1000*(time.perf_counter()-start),2))
 for _ in range(5):
  start=time.perf_counter();data=await asyncio.to_thread(storage.read,path);report['same_client_read_ms'].append(round(1000*(time.perf_counter()-start),2))
 report['bytes']=len(data);await engine.dispose();print(json.dumps(report,indent=2))
asyncio.run(main())
